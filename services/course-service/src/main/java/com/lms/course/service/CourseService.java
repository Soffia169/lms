package com.lms.course.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.lms.common.events.EventPayloads.CoursePublishedEvent;
import com.lms.common.events.EventPayloads.CourseUpdatedEvent;
import com.lms.common.events.EventTopics;
import com.lms.common.web.ResourceNotFoundException;
import com.lms.course.model.Course;
import com.lms.course.repository.CourseRepository;
import com.lms.course.model.Lesson;
import com.lms.course.outbox.OutboxWriter;
import com.lms.course.dto.CourseDetailResponse;
import com.lms.course.dto.CourseSummaryResponse;
import com.lms.course.dto.CreateCourseRequest;
import com.lms.course.dto.UpdateCourseRequest;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Сценарии работы с курсами. События (course.published / course.updated)
 * пишутся в outbox в той же транзакции, что и изменение курса.
 */
@Service
public class CourseService {

    private final CourseRepository courses;
    private final OutboxWriter outboxWriter;
    private final Clock clock;

    public CourseService(CourseRepository courses, OutboxWriter outboxWriter, Clock clock) {
        this.courses = courses;
        this.outboxWriter = outboxWriter;
        this.clock = clock;
    }

    @Transactional
    public CourseDetailResponse create(CreateCourseRequest request, CurrentUser user) {
        Course course = new Course(
                UUID.randomUUID(),
                request.title().trim(),
                normalize(request.description()),
                user.id());
        courses.save(course);
        return CourseDetailResponse.from(course);
    }

    @Transactional(readOnly = true)
    public List<CourseSummaryResponse> list(Boolean published) {
        List<Course> result = published == null
                ? courses.findAllByOrderByCreatedAtDesc()
                : courses.findAllByPublishedOrderByCreatedAtDesc(published);
        return result.stream().map(CourseSummaryResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public CourseDetailResponse get(UUID courseId) {
        return CourseDetailResponse.from(requireCourse(courseId));
    }

    @Transactional
    public CourseDetailResponse update(UUID courseId, UpdateCourseRequest request, CurrentUser user) {
        Course course = requireCourse(courseId);
        CourseAccessGuard.requireManageable(course, user);
        course.rename(request.title().trim(), normalize(request.description()));

        Instant now = clock.instant();
        outboxWriter.append(UUID.randomUUID(), EventTopics.COURSE_UPDATED,
                new CourseUpdatedEvent(course.getId(), course.getInstructorId(), course.getTitle(),
                        course.getDescription(), course.isPublished(), course.getPublishedAt(),
                        lessonIds(course), now),
                now);

        return CourseDetailResponse.from(course);
    }

    @Transactional
    public void delete(UUID courseId, CurrentUser user) {
        Course course = requireCourse(courseId);
        CourseAccessGuard.requireManageable(course, user);
        courses.delete(course);
    }

    @Transactional
    public CourseSummaryResponse publish(UUID courseId, CurrentUser user) {
        Course course = requireCourse(courseId);
        CourseAccessGuard.requireManageable(course, user);

        Instant now = clock.instant();
        if (course.publish(now)) {
            outboxWriter.append(UUID.randomUUID(), EventTopics.COURSE_PUBLISHED,
                    new CoursePublishedEvent(course.getId(), course.getInstructorId(), course.getTitle(),
                            course.getDescription(), lessonIds(course), course.getPublishedAt()),
                    now);
        }
        return CourseSummaryResponse.from(course);
    }

    @Transactional
    public CourseSummaryResponse unpublish(UUID courseId, CurrentUser user) {
        Course course = requireCourse(courseId);
        CourseAccessGuard.requireManageable(course, user);

        boolean wasPublished = course.isPublished();
        course.unpublish();
        if (wasPublished) {
            Instant now = clock.instant();
            // Отдельного course.unpublished в каталоге нет — сообщаем через course.updated.
            outboxWriter.append(UUID.randomUUID(), EventTopics.COURSE_UPDATED,
                    new CourseUpdatedEvent(course.getId(), course.getInstructorId(), course.getTitle(),
                            course.getDescription(), false, null, lessonIds(course), now),
                    now);
        }
        return CourseSummaryResponse.from(course);
    }

    Course requireCourse(UUID courseId) {
        return courses.findById(courseId)
                .orElseThrow(() -> ResourceNotFoundException.of("Course", courseId));
    }

    private static List<UUID> lessonIds(Course course) {
        return course.getModules().stream()
                .flatMap(module -> module.getLessons().stream())
                .map(Lesson::getId)
                .toList();
    }

    private static String normalize(String description) {
        return description == null || description.isBlank() ? null : description.trim();
    }
}
