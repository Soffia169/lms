package com.lms.enrollment.model;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

/**
 * Локальный снапшот опубликованного курса — единственный источник данных
 * о курсе для enrollment-service (без синхронных вызовов course-service).
 */
@Entity
@Table(name = "course_snapshot")
public class CourseSnapshot {

    @Id
    @Column(name = "course_id")
    private UUID courseId;

    @Column(name = "instructor_id", nullable = false)
    private UUID instructorId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 5000)
    private String description;

    @Column(nullable = false)
    private boolean published;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "course_snapshot_lesson", joinColumns = @JoinColumn(name = "course_id"))
    @Column(name = "lesson_id", nullable = false)
    private Set<UUID> lessonIds = new HashSet<>();

    protected CourseSnapshot() {
        // для JPA
    }

    public CourseSnapshot(UUID courseId) {
        this.courseId = courseId;
        this.updatedAt = Instant.now();
    }

    public UUID getCourseId() {
        return courseId;
    }

    public UUID getInstructorId() {
        return instructorId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public boolean isPublished() {
        return published;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Set<UUID> getLessonIds() {
        return lessonIds;
    }

    public boolean containsLesson(UUID lessonId) {
        return lessonIds.contains(lessonId);
    }

    public void update(UUID newInstructorId, String newTitle, String newDescription,
                       boolean newPublished, Instant newPublishedAt, Instant now,
                       List<UUID> newLessonIds) {
        this.instructorId = newInstructorId;
        this.title = newTitle;
        this.description = newDescription;
        this.published = newPublished;
        this.publishedAt = newPublishedAt;
        this.updatedAt = now;
        this.lessonIds.clear();
        if (newLessonIds != null) {
            this.lessonIds.addAll(newLessonIds);
        }
    }
}
