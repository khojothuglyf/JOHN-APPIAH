package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.util.AppConstants;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/health")
public class HealthController {

    @GetMapping
    public ResponseEntity<ApiResponse<String>> checkHealth() {
        return ResponseEntity.ok(ApiResponse.success("Marketplace System API is up and running."));
    }
}
