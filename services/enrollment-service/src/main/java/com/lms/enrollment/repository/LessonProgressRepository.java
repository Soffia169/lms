package com.lms.enrollment.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.lms.enrollment.model.LessonProgress;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LessonProgressRepository extends JpaRepository<LessonProgress, UUID> {

    List<LessonProgress> findAllByEnrollmentIdOrderByCompletedAtAsc(UUID enrollmentId);

    Optional<LessonProgress> findByEnrollmentIdAndLessonId(UUID enrollmentId, UUID lessonId);
}
