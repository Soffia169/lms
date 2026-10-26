package com.lms.enrollment.controller;

import java.util.List;
import java.util.UUID;

import com.lms.enrollment.service.CurrentUser;
import com.lms.enrollment.service.EnrollmentService;
import com.lms.enrollment.dto.CreateEnrollmentRequest;
import com.lms.enrollment.dto.EnrollmentResponse;
import com.lms.enrollment.dto.EnrollmentResponse.LessonProgressResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP-адаптер записей на курс. Записаться может только STUDENT; работать
 * с записью — только её владелец (проверка в сервисе).
 */
@RestController
@RequestMapping("/api/enrollments")
@Tag(name = "Enrollments", description = "Запись на курс, отмена, прогресс")
public class EnrollmentController {

    private final EnrollmentService enrollmentService;

    public EnrollmentController(EnrollmentService enrollmentService) {
        this.enrollmentService = enrollmentService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('STUDENT')")
    @Operation(summary = "Запись на опубликованный курс")
    public EnrollmentResponse enroll(@Valid @RequestBody CreateEnrollmentRequest request,
                                     @AuthenticationPrincipal Jwt jwt) {
        return enrollmentService.enroll(CurrentUser.from(jwt).id(), request.courseId());
    }

    @GetMapping
    @Operation(summary = "Мои записи")
    public List<EnrollmentResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return enrollmentService.listMine(CurrentUser.from(jwt).id());
    }

    @GetMapping("/{enrollmentId}")
    @Operation(summary = "Запись с прогрессом")
    public EnrollmentResponse get(@PathVariable UUID enrollmentId, @AuthenticationPrincipal Jwt jwt) {
        return enrollmentService.get(CurrentUser.from(jwt).id(), enrollmentId);
    }

    @GetMapping("/{enrollmentId}/progress")
    @Operation(summary = "Прогресс по урокам")
    public List<LessonProgressResponse> progress(@PathVariable UUID enrollmentId,
                                                 @AuthenticationPrincipal Jwt jwt) {
        return enrollmentService.getProgress(CurrentUser.from(jwt).id(), enrollmentId);
    }

    @PostMapping("/{enrollmentId}/cancel")
    @Operation(summary = "Отмена записи")
    public EnrollmentResponse cancel(@PathVariable UUID enrollmentId, @AuthenticationPrincipal Jwt jwt) {
        return enrollmentService.cancel(CurrentUser.from(jwt).id(), enrollmentId);
    }

    @PostMapping("/{enrollmentId}/lessons/{lessonId}/complete")
    @Operation(summary = "Отметить урок завершённым (идемпотентно)")
    public LessonProgressResponse completeLesson(@PathVariable UUID enrollmentId,
                                                 @PathVariable UUID lessonId,
                                                 @AuthenticationPrincipal Jwt jwt) {
        return enrollmentService.completeLesson(CurrentUser.from(jwt).id(), enrollmentId, lessonId);
    }
}
