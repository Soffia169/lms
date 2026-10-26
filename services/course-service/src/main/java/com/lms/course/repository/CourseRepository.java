package com.lms.course.repository;

import java.util.List;
import java.util.UUID;

import com.lms.course.model.Course;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CourseRepository extends JpaRepository<Course, UUID> {

    List<Course> findAllByOrderByCreatedAtDesc();

    List<Course> findAllByPublishedOrderByCreatedAtDesc(boolean published);

    /**
     * Атомарное изменение счётчика: консьюмеры enrollment.events могут
     * обрабатываться параллельно, read-modify-write здесь недопустим.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Course c set c.enrolledCount = c.enrolledCount + :delta where c.id = :courseId")
    int adjustEnrolledCount(@Param("courseId") UUID courseId, @Param("delta") int delta);
}
