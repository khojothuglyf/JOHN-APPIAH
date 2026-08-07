package com.marketplacesystem.dto;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

public record ApiResponse<T>(boolean success, String message, T data, LocalDateTime timestamp) {

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, "Request processed successfully", data, now());
    }

    public static <T> ApiResponse<T> success(T data, String message) {
        return new ApiResponse<>(true, message, data, now());
    }

    public static <T> ApiResponse<T> error(String message) {
        return new ApiResponse<>(false, message, null, now());
    }

    public static <T> ApiResponse<T> error(String message, T data) {
        return new ApiResponse<>(false, message, data, now());
    }

    private static LocalDateTime now() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }
}
