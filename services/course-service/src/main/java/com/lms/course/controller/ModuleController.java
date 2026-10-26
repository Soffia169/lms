package com.lms.course.controller;

import java.util.UUID;

import com.lms.course.service.CurrentUser;
import com.lms.course.service.ModuleService;
import com.lms.course.dto.CreateLessonRequest;
import com.lms.course.dto.LessonResponse;
import com.lms.course.dto.ModuleResponse;
import com.lms.course.dto.UpdateModuleRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/modules")
@Tag(name = "Modules", description = "Модули и уроки")
public class ModuleController {

    private final ModuleService moduleService;

    public ModuleController(ModuleService moduleService) {
        this.moduleService = moduleService;
    }

    @PutMapping("/{moduleId}")
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Изменение модуля")
    public ModuleResponse update(@PathVariable UUID moduleId,
                                 @Valid @RequestBody UpdateModuleRequest request,
                                 @AuthenticationPrincipal Jwt jwt) {
        return moduleService.updateModule(moduleId, request, CurrentUser.from(jwt));
    }

    @DeleteMapping("/{moduleId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Удаление модуля вместе с уроками")
    public void delete(@PathVariable UUID moduleId, @AuthenticationPrincipal Jwt jwt) {
        moduleService.deleteModule(moduleId, CurrentUser.from(jwt));
    }

    @PostMapping("/{moduleId}/lessons")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Добавление урока в модуль")
    public LessonResponse addLesson(@PathVariable UUID moduleId,
                                    @Valid @RequestBody CreateLessonRequest request,
                                    @AuthenticationPrincipal Jwt jwt) {
        return moduleService.addLesson(moduleId, request, CurrentUser.from(jwt));
    }
}
