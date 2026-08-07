package com.marketplacesystem.config;

import com.marketplacesystem.entity.Role;
import com.marketplacesystem.entity.RoleName;
import com.marketplacesystem.entity.User;
import com.marketplacesystem.repository.RoleRepository;
import com.marketplacesystem.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class RoleDataInitializer implements CommandLineRunner {

    private static final String ADMIN_EMAIL = "admin@marketplace.com";
    private static final String ADMIN_PASSWORD = "AdminPass123";

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public RoleDataInitializer(RoleRepository roleRepository,
                               UserRepository userRepository,
                               PasswordEncoder passwordEncoder) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        seedRoleIfAbsent(RoleName.ADMIN);
        seedRoleIfAbsent(RoleName.SELLER);
        seedRoleIfAbsent(RoleName.CUSTOMER);
        seedAdminIfAbsent();
    }

    private void seedRoleIfAbsent(RoleName name) {
        if (!roleRepository.existsByName(name)) {
            roleRepository.save(new Role(name));
        }
    }

    private void seedAdminIfAbsent() {
        Role adminRole = roleRepository.findByName(RoleName.ADMIN)
                .orElseThrow(() -> new IllegalStateException("ADMIN role must exist before seeding the admin user"));
        User admin = userRepository.findByEmail(ADMIN_EMAIL).orElse(null);
        if (admin == null) {
            admin = new User();
            admin.setFirstName("Admin");
            admin.setLastName("User");
            admin.setEmail(ADMIN_EMAIL);
            admin.setRole(adminRole);
            admin.setPassword(passwordEncoder.encode(ADMIN_PASSWORD));
        } else if (!passwordEncoder.matches(ADMIN_PASSWORD, admin.getPassword())) {
            admin.setPassword(passwordEncoder.encode(ADMIN_PASSWORD));
        }
        userRepository.save(admin);
    }
}
