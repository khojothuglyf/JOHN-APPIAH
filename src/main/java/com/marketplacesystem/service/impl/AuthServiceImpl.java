package com.marketplacesystem.service.impl;

import com.marketplacesystem.config.JwtProperties;
import com.marketplacesystem.dto.AuthResponse;
import com.marketplacesystem.dto.LoginRequest;
import com.marketplacesystem.dto.RegisterRequest;
import com.marketplacesystem.entity.Role;
import com.marketplacesystem.entity.RoleName;
import com.marketplacesystem.entity.User;
import com.marketplacesystem.exception.BadRequestException;
import com.marketplacesystem.exception.ConflictException;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.exception.UnauthorizedException;
import com.marketplacesystem.mapper.UserMapper;
import com.marketplacesystem.repository.RoleRepository;
import com.marketplacesystem.repository.UserRepository;
import com.marketplacesystem.security.JwtService;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.AuthService;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;
    private final UserMapper userMapper;

    public AuthServiceImpl(UserRepository userRepository,
                           RoleRepository roleRepository,
                           PasswordEncoder passwordEncoder,
                           AuthenticationManager authenticationManager,
                           JwtService jwtService,
                           JwtProperties jwtProperties,
                           UserMapper userMapper) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.jwtProperties = jwtProperties;
        this.userMapper = userMapper;
    }

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("An account with this email already exists");
        }

        Role role = resolveRole(request.roleName());
        User user = new User();
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(request.password()));
        user.setRole(role);
        userRepository.save(user);

        String token = jwtService.generateToken(new UserPrincipal(user));
        return buildAuthResponse(user, token);
    }

    @Override
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password()));
            UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();
            String token = jwtService.generateToken(principal);
            return buildAuthResponse(principal.getUser(), token);
        } catch (BadCredentialsException exception) {
            throw new UnauthorizedException("Invalid email or password");
        }
    }

    private Role resolveRole(RoleName requestedRole) {
        RoleName roleName = requestedRole == null ? RoleName.CUSTOMER : requestedRole;
        if (roleName == RoleName.ADMIN) {
            throw new BadRequestException("The ADMIN role cannot be assigned through registration");
        }
        return roleRepository.findByName(roleName)
                .orElseThrow(() -> new ResourceNotFoundException("Role not found: " + roleName));
    }

    private AuthResponse buildAuthResponse(User user, String token) {
        return new AuthResponse(token, "Bearer", jwtProperties.expirationMs() / 1000, userMapper.toResponse(user));
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
