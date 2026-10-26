package com.lms.enrollment.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.lms.enrollment.model.Enrollment;
import com.lms.enrollment.model.EnrollmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EnrollmentRepository extends JpaRepository<Enrollment, UUID> {

    List<Enrollment> findAllByStudentIdOrderByEnrolledAtDesc(UUID studentId);

    Optional<Enrollment> findByIdAndStudentId(UUID id, UUID studentId);

    boolean existsByStudentIdAndCourseIdAndStatus(UUID studentId, UUID courseId, EnrollmentStatus status);
}
