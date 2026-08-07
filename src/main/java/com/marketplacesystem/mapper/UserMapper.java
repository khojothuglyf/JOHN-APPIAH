package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.UserResponse;
import com.marketplacesystem.entity.User;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

    public UserResponse toResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole().getName());
    }
}
