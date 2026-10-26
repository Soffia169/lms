package com.lms.course.repository;

import java.util.UUID;

import com.lms.course.model.Lesson;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LessonRepository extends JpaRepository<Lesson, UUID> {
}
