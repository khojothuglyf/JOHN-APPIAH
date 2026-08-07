package com.marketplacesystem.repository;

import com.marketplacesystem.entity.Role;
import com.marketplacesystem.entity.RoleName;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Long> {

    Optional<Role> findByName(RoleName name);

    boolean existsByName(RoleName name);
}
