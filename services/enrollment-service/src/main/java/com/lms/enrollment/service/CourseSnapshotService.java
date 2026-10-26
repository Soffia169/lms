package com.lms.enrollment.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.lms.common.events.EventPayloads.CoursePublishedEvent;
import com.lms.common.events.EventPayloads.CourseUpdatedEvent;
import com.lms.enrollment.model.CourseSnapshot;
import com.lms.enrollment.repository.CourseSnapshotRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Обновление снапшота курса по событиям course-service. */
@Service
public class CourseSnapshotService {

    private final CourseSnapshotRepository snapshots;
    private final Clock clock;

    public CourseSnapshotService(CourseSnapshotRepository snapshots, Clock clock) {
        this.snapshots = snapshots;
        this.clock = clock;
    }

    @Transactional
    public void applyPublished(CoursePublishedEvent event) {
        upsert(event.courseId(), event.instructorId(), event.title(), event.description(),
                true, event.publishedAt(), event.lessonIds());
    }

    @Transactional
    public void applyUpdated(CourseUpdatedEvent event) {
        upsert(event.courseId(), event.instructorId(), event.title(), event.description(),
                event.published(), event.publishedAt(), event.lessonIds());
    }

    private void upsert(UUID courseId, UUID instructorId, String title, String description,
                        boolean published, Instant publishedAt, List<UUID> lessonIds) {
        CourseSnapshot snapshot = snapshots.findById(courseId)
                .orElseGet(() -> new CourseSnapshot(courseId));
        snapshot.update(instructorId, title, description, published, publishedAt, clock.instant(), lessonIds);
        snapshots.save(snapshot);
    }
}
