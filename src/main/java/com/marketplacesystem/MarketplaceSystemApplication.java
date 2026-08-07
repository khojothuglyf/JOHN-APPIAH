package com.marketplacesystem;

import com.marketplacesystem.config.JwtProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(JwtProperties.class)
public class MarketplaceSystemApplication {

    public static void main(String[] args) {
        SpringApplication.run(MarketplaceSystemApplication.class, args);
    }
}
