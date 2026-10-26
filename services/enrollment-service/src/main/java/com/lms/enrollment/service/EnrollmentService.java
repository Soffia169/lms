package com.lms.enrollment.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.lms.common.events.EventPayloads.EnrollmentCancelledEvent;
import com.lms.common.events.EventPayloads.EnrollmentCreatedEvent;
import com.lms.common.events.EventPayloads.LessonCompletedEvent;
import com.lms.common.events.EventTopics;
import com.lms.common.web.ConflictException;
import com.lms.common.web.ResourceNotFoundException;
import com.lms.enrollment.model.CourseSnapshot;
import com.lms.enrollment.repository.CourseSnapshotRepository;
import com.lms.enrollment.model.Enrollment;
import com.lms.enrollment.repository.EnrollmentRepository;
import com.lms.enrollment.model.EnrollmentStatus;
import com.lms.enrollment.model.LessonProgress;
import com.lms.enrollment.repository.LessonProgressRepository;
import com.lms.enrollment.outbox.OutboxWriter;
import com.lms.enrollment.dto.EnrollmentResponse;
import com.lms.enrollment.dto.EnrollmentResponse.LessonProgressResponse;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Запись на курс, отмена и прогресс.
 *
 * <p>Данные о курсе берутся только из локального снапшота: синхронных вызовов
 * course-service нет. Каждое изменение порождает событие в outbox в той же
 * транзакции.</p>
 */
@Service
public class EnrollmentService {

    private final EnrollmentRepository enrollments;
    private final LessonProgressRepository progress;
    private final CourseSnapshotRepository snapshots;
    private final OutboxWriter outboxWriter;
    private final Clock clock;

    public EnrollmentService(EnrollmentRepository enrollments,
                             LessonProgressRepository progress,
                             CourseSnapshotRepository snapshots,
                             OutboxWriter outboxWriter,
                             Clock clock) {
        this.enrollments = enrollments;
        this.progress = progress;
        this.snapshots = snapshots;
        this.outboxWriter = outboxWriter;
        this.clock = clock;
    }

    @Transactional
    public EnrollmentResponse enroll(UUID studentId, UUID courseId) {
        CourseSnapshot snapshot = snapshots.findById(courseId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Course is not available yet: " + courseId));
        if (!snapshot.isPublished()) {
            throw new ConflictException("Course is not published");
        }
        if (enrollments.existsByStudentIdAndCourseIdAndStatus(studentId, courseId, EnrollmentStatus.ACTIVE)) {
            throw new ConflictException("Already enrolled in this course");
        }

        Instant now = clock.instant();
        Enrollment enrollment = new Enrollment(UUID.randomUUID(), studentId, courseId, now);
        enrollments.save(enrollment);

        outboxWriter.append(UUID.randomUUID(), EventTopics.ENROLLMENT_CREATED,
                new EnrollmentCreatedEvent(enrollment.getId(), courseId, studentId, now), now);

        return EnrollmentResponse.from(enrollment, snapshot, List.of());
    }

    @Transactional
    public EnrollmentResponse cancel(UUID studentId, UUID enrollmentId) {
        Enrollment enrollment = requireOwned(studentId, enrollmentId);
        if (!enrollment.isActive()) {
            throw new ConflictException("Only active enrollment can be cancelled");
        }

        Instant now = clock.instant();
        enrollment.cancel(now);
        outboxWriter.append(UUID.randomUUID(), EventTopics.ENROLLMENT_CANCELLED,
                new EnrollmentCancelledEvent(enrollment.getId(), enrollment.getCourseId(), studentId, now), now);

        return EnrollmentResponse.from(enrollment, snapshots.findById(enrollment.getCourseId()).orElse(null),
                progress.findAllByEnrollmentIdOrderByCompletedAtAsc(enrollmentId));
    }

    @Transactional
    public LessonProgressResponse completeLesson(UUID studentId, UUID enrollmentId, UUID lessonId) {
        Enrollment enrollment = requireOwned(studentId, enrollmentId);
        if (!enrollment.isActive()) {
            throw new ConflictException("Enrollment is not active");
        }

        CourseSnapshot snapshot = snapshots.findById(enrollment.getCourseId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Course snapshot is missing: " + enrollment.getCourseId()));
        if (!snapshot.containsLesson(lessonId)) {
            throw ResourceNotFoundException.of("Lesson", lessonId);
        }

        LessonProgress existing = progress.findByEnrollmentIdAndLessonId(enrollmentId, lessonId).orElse(null);
        if (existing != null) {
            // Идемпотентно: повторная отметка не создаёт новое событие.
            return LessonProgressResponse.from(existing);
        }

        Instant now = clock.instant();
        LessonProgress completed = new LessonProgress(UUID.randomUUID(), enrollmentId, lessonId, now);
        progress.save(completed);

        outboxWriter.append(UUID.randomUUID(), EventTopics.LESSON_COMPLETED,
                new LessonCompletedEvent(enrollmentId, enrollment.getCourseId(), lessonId, studentId, now), now);

        return LessonProgressResponse.from(completed);
    }

    @Transactional(readOnly = true)
    public List<EnrollmentResponse> listMine(UUID studentId) {
        return enrollments.findAllByStudentIdOrderByEnrolledAtDesc(studentId).stream()
                .map(enrollment -> EnrollmentResponse.from(
                        enrollment,
                        snapshots.findById(enrollment.getCourseId()).orElse(null),
                        progress.findAllByEnrollmentIdOrderByCompletedAtAsc(enrollment.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public EnrollmentResponse get(UUID studentId, UUID enrollmentId) {
        Enrollment enrollment = requireOwned(studentId, enrollmentId);
        return EnrollmentResponse.from(enrollment,
                snapshots.findById(enrollment.getCourseId()).orElse(null),
                progress.findAllByEnrollmentIdOrderByCompletedAtAsc(enrollmentId));
    }

    @Transactional(readOnly = true)
    public List<LessonProgressResponse> getProgress(UUID studentId, UUID enrollmentId) {
        requireOwned(studentId, enrollmentId);
        return progress.findAllByEnrollmentIdOrderByCompletedAtAsc(enrollmentId).stream()
                .map(LessonProgressResponse::from)
                .toList();
    }

    private Enrollment requireOwned(UUID studentId, UUID enrollmentId) {
        Enrollment enrollment = enrollments.findById(enrollmentId)
                .orElseThrow(() -> ResourceNotFoundException.of("Enrollment", enrollmentId));
        if (!enrollment.getStudentId().equals(studentId)) {
            throw new AccessDeniedException("Enrollment belongs to another student");
        }
        return enrollment;
    }
}
