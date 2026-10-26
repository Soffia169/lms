package com.lms.course.controller;

import java.util.List;
import java.util.UUID;

import com.lms.course.service.CourseService;
import com.lms.course.service.CurrentUser;
import com.lms.course.service.ModuleService;
import com.lms.course.dto.CourseDetailResponse;
import com.lms.course.dto.CourseSummaryResponse;
import com.lms.course.dto.CreateCourseRequest;
import com.lms.course.dto.CreateModuleRequest;
import com.lms.course.dto.ModuleResponse;
import com.lms.course.dto.UpdateCourseRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP-адаптер курсов. Чтение доступно любому аутентифицированному пользователю,
 * изменение — только инструктору-владельцу или ADMIN.
 */
@RestController
@RequestMapping("/api/courses")
@Tag(name = "Courses", description = "Курсы, модули, публикация")
public class CourseController {

    private final CourseService courseService;
    private final ModuleService moduleService;

    public CourseController(CourseService courseService, ModuleService moduleService) {
        this.courseService = courseService;
        this.moduleService = moduleService;
    }

    @GetMapping
    @Operation(summary = "Список курсов; published=true|false фильтрует по публикации")
    public List<CourseSummaryResponse> list(@RequestParam(required = false) Boolean published) {
        return courseService.list(published);
    }

    @GetMapping("/{courseId}")
    @Operation(summary = "Курс с модулями и уроками")
    public CourseDetailResponse get(@PathVariable UUID courseId) {
        return courseService.get(courseId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Создание курса (INSTRUCTOR/ADMIN)")
    public CourseDetailResponse create(@Valid @RequestBody CreateCourseRequest request,
                                       @AuthenticationPrincipal Jwt jwt) {
        return courseService.create(request, CurrentUser.from(jwt));
    }

    @PutMapping("/{courseId}")
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Изменение курса владельцем или ADMIN")
    public CourseDetailResponse update(@PathVariable UUID courseId,
                                       @Valid @RequestBody UpdateCourseRequest request,
                                       @AuthenticationPrincipal Jwt jwt) {
        return courseService.update(courseId, request, CurrentUser.from(jwt));
    }

    @DeleteMapping("/{courseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Удаление курса вместе с модулями и уроками")
    public void delete(@PathVariable UUID courseId, @AuthenticationPrincipal Jwt jwt) {
        courseService.delete(courseId, CurrentUser.from(jwt));
    }

    @PostMapping("/{courseId}/publish")
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Публикация курса")
    public CourseSummaryResponse publish(@PathVariable UUID courseId, @AuthenticationPrincipal Jwt jwt) {
        return courseService.publish(courseId, CurrentUser.from(jwt));
    }

    @PostMapping("/{courseId}/unpublish")
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Снятие курса с публикации")
    public CourseSummaryResponse unpublish(@PathVariable UUID courseId, @AuthenticationPrincipal Jwt jwt) {
        return courseService.unpublish(courseId, CurrentUser.from(jwt));
    }

    @PostMapping("/{courseId}/modules")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('INSTRUCTOR', 'ADMIN')")
    @Operation(summary = "Добавление модуля в курс")
    public ModuleResponse addModule(@PathVariable UUID courseId,
                                    @Valid @RequestBody CreateModuleRequest request,
                                    @AuthenticationPrincipal Jwt jwt) {
        return moduleService.addModule(courseId, request, CurrentUser.from(jwt));
    }
}
