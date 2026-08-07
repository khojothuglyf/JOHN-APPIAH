package com.marketplacesystem.dto;

import com.marketplacesystem.entity.RoleName;

public record UserResponse(Long id, String firstName, String lastName, String email, RoleName role) {
}
