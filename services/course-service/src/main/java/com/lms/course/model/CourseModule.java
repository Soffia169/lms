package com.lms.course.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * Модуль курса. Таблица называется {@code modules}; класс — CourseModule,
 * потому что {@code Module} уже занято {@code java.lang.Module}.
 */
@Entity
@Table(name = "modules")
public class CourseModule {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false)
    private int position;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "module", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<Lesson> lessons = new ArrayList<>();

    protected CourseModule() {
        // для JPA
    }

    CourseModule(UUID id, Course course, String title, int position) {
        this.id = id;
        this.course = course;
        this.title = title;
        this.position = position;
    }

    public UUID getId() {
        return id;
    }

    public Course getCourse() {
        return course;
    }

    public String getTitle() {
        return title;
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

    public List<Lesson> getLessons() {
        return lessons;
    }

    public void update(String newTitle, int newPosition) {
        this.title = newTitle;
        this.position = newPosition;
    }

    public Lesson addLesson(String lessonTitle, String content, int lessonPosition) {
        Lesson lesson = new Lesson(UUID.randomUUID(), this, lessonTitle, content, lessonPosition);
        lessons.add(lesson);
        return lesson;
    }

    public void removeLesson(Lesson lesson) {
        lessons.remove(lesson);
    }

    public int nextLessonPosition() {
        return lessons.size();
    }
}
