package com.lms.enrollment.repository;

import java.util.UUID;

import com.lms.enrollment.model.CourseSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseSnapshotRepository extends JpaRepository<CourseSnapshot, UUID> {
}
