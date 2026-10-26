package com.lms.course.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * Курс. Владелец — инструктор ({@code instructorId}); публикация управляется
 * флагом {@code is_published} (события появятся на этапе 2).
 */
@Entity
@Table(name = "courses")
public class Course {

    @Id
    private UUID id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 5000)
    private String description;

    @Column(name = "instructor_id", nullable = false)
    private UUID instructorId;

    @Column(name = "is_published", nullable = false)
    private boolean published;

    @Column(name = "published_at")
    private Instant publishedAt;

    /** Счётчик активных записей; обновляется консьюмером enrollment.events. */
    @Column(name = "enrolled_count", nullable = false)
    private int enrolledCount;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "course", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<CourseModule> modules = new ArrayList<>();

    protected Course() {
        // для JPA
    }

    public Course(UUID id, String title, String description, UUID instructorId) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.instructorId = instructorId;
        this.published = false;
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public UUID getInstructorId() {
        return instructorId;
    }

    public boolean isPublished() {
        return published;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<CourseModule> getModules() {
        return modules;
    }

    public int getEnrolledCount() {
        return enrolledCount;
    }

    public void rename(String newTitle, String newDescription) {
        this.title = newTitle;
        this.description = newDescription;
    }

    /**
     * @return {@code true}, если курс действительно сменил состояние
     */
    public boolean publish(Instant now) {
        if (published) {
            return false;
        }
        published = true;
        publishedAt = now;
        return true;
    }

    public void unpublish() {
        published = false;
        publishedAt = null;
    }

    public CourseModule addModule(String moduleTitle, int position) {
        CourseModule module = new CourseModule(UUID.randomUUID(), this, moduleTitle, position);
        modules.add(module);
        return module;
    }

    public void removeModule(CourseModule module) {
        modules.remove(module);
    }

    public int nextModulePosition() {
        return modules.size();
    }
}
