package config

import (
	"fmt"
	"os"
)

// Config holds all configuration values loaded from environment variables.
type Config struct {
	Port         string
	ServiceName  string
	DBHost       string
	DBPort       string
	DBUser       string
	DBPassword   string
	DBName       string
	KafkaBrokers string
	RabbitMQURL  string
	LogFilePath  string
}

// Load reads all configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		Port:         getEnv("PORT", "8084"),
		ServiceName:  getEnv("SERVICE_NAME", "delivery-service"),
		DBHost:       getEnv("DB_HOST", "localhost"),
		DBPort:       getEnv("DB_PORT", "5432"),
		DBUser:       getEnv("DB_USER", "postgres"),
		DBPassword:   getEnv("DB_PASSWORD", "postgres"),
		DBName:       getEnv("DB_NAME", "deliverydb"),
		KafkaBrokers: getEnv("KAFKA_BROKERS", "localhost:9092"),
		RabbitMQURL:  getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		LogFilePath:  getEnv("LOG_FILE_PATH", ""),
	}
}

// DSN returns the PostgreSQL connection string.
func (c *Config) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
