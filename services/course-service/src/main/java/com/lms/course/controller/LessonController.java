package com.lms.course.controller;

import java.util.UUID;

import com.lms.course.service.CurrentUser;
import com.lms.course.service.LessonService;
import com.lms.course.dto.LessonResponse;
import com.lms.course.dto.UpdateLessonRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lessons")
@Tag(name = "Lessons", description = "Уроки")
public class LessonController {

    private final LessonService lessonService;

    public LessonController(LessonService lessonService) {
        this.lessonService = lessonService;
    }

    @PutMapping("/{lessonId}")
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Изменение урока")
    public LessonResponse update(@PathVariable UUID lessonId,
                                 @Valid @RequestBody UpdateLessonRequest request,
                                 @AuthenticationPrincipal Jwt jwt) {
        return lessonService.updateLesson(lessonId, request, CurrentUser.from(jwt));
    }

    @DeleteMapping("/{lessonId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Удаление урока")
    public void delete(@PathVariable UUID lessonId, @AuthenticationPrincipal Jwt jwt) {
        lessonService.deleteLesson(lessonId, CurrentUser.from(jwt));
    }
}
