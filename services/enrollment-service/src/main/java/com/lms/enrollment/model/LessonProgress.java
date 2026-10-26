package com.lms.enrollment.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Отметка о завершении урока; {@code score} заполняется на этапе 3. */
@Entity
@Table(name = "lesson_progress")
public class LessonProgress {

    @Id
    private UUID id;

    @Column(name = "enrollment_id", nullable = false)
    private UUID enrollmentId;

    @Column(name = "lesson_id", nullable = false)
    private UUID lessonId;

    @Column(name = "completed_at", nullable = false)
    private Instant completedAt;

    @Column(precision = 5, scale = 2)
    private BigDecimal score;

    protected LessonProgress() {
        // для JPA
    }

    public LessonProgress(UUID id, UUID enrollmentId, UUID lessonId, Instant completedAt) {
        this.id = id;
        this.enrollmentId = enrollmentId;
        this.lessonId = lessonId;
        this.completedAt = completedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getEnrollmentId() {
        return enrollmentId;
    }

    public UUID getLessonId() {
        return lessonId;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public BigDecimal getScore() {
        return score;
    }

    public void applyScore(BigDecimal newScore) {
        this.score = newScore;
    }
}
