package com.marketplacesystem.service;

import com.marketplacesystem.dto.AuthResponse;
import com.marketplacesystem.dto.LoginRequest;
import com.marketplacesystem.dto.RegisterRequest;

public interface AuthService {

    AuthResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request);
}
