package com.lms.course.repository;

import java.util.UUID;

import com.lms.course.model.CourseModule;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseModuleRepository extends JpaRepository<CourseModule, UUID> {
}
