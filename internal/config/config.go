package config

import "os"

// Config holds all configuration values loaded from environment variables.
type Config struct {
	Port         string
	ServiceName  string
	DatabaseURL  string
	KafkaBrokers string
	RabbitMQURL  string
	LogFilePath  string
}

// Load reads all configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		Port:         getEnv("PORT", "8084"),
		ServiceName:  getEnv("SERVICE_NAME", "delivery-service"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		KafkaBrokers: getEnv("KAFKA_BROKERS", "kafka:9092"),
		RabbitMQURL:  getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		LogFilePath:  getEnv("LOG_FILE_PATH", ""),
	}
}

// DSN returns the PostgreSQL connection string supplied through DATABASE_URL.
func (c *Config) DSN() string {
	return c.DatabaseURL
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
