package com.lms.enrollment.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "enrollments")
public class Enrollment {

    @Id
    private UUID id;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "course_id", nullable = false)
    private UUID courseId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EnrollmentStatus status;

    @Column(name = "enrolled_at", nullable = false)
    private Instant enrolledAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Enrollment() {
        // для JPA
    }

    public Enrollment(UUID id, UUID studentId, UUID courseId, Instant enrolledAt) {
        this.id = id;
        this.studentId = studentId;
        this.courseId = courseId;
        this.status = EnrollmentStatus.ACTIVE;
        this.enrolledAt = enrolledAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getStudentId() {
        return studentId;
    }

    public UUID getCourseId() {
        return courseId;
    }

    public EnrollmentStatus getStatus() {
        return status;
    }

    public Instant getEnrolledAt() {
        return enrolledAt;
    }

    public Instant getCancelledAt() {
        return cancelledAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isActive() {
        return status == EnrollmentStatus.ACTIVE;
    }

    public void cancel(Instant now) {
        this.status = EnrollmentStatus.CANCELLED;
        this.cancelledAt = now;
    }
}
