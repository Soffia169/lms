package com.lms.course.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * Урок. На этапе 1 контент — простой текст; на этапе 4 появится ссылка на media.
 */
@Entity
@Table(name = "lessons")
public class Lesson {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "module_id", nullable = false)
    private CourseModule module;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 20000)
    private String content;

    @Column(nullable = false)
    private int position;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Lesson() {
        // для JPA
    }

    Lesson(UUID id, CourseModule module, String title, String content, int position) {
        this.id = id;
        this.module = module;
        this.title = title;
        this.content = content;
        this.position = position;
    }

    public UUID getId() {
        return id;
    }

    public CourseModule getModule() {
        return module;
    }

    public String getTitle() {
        return title;
    }

    public String getContent() {
        return content;
    }

    public int getPosition() {
        return position;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(String newTitle, String newContent, int newPosition) {
        this.title = newTitle;
        this.content = newContent;
        this.position = newPosition;
    }
}
