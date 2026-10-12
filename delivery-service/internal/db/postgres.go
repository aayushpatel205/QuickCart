package db

import (
	"database/sql"
	"os"
	"path/filepath"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/quickcart/delivery-service/internal/logger"
)

// Connect opens a connection pool to PostgreSQL and verifies connectivity.
func Connect(dsn string) (*sql.DB, error) {
	database, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}

	database.SetMaxOpenConns(10)
	database.SetMaxIdleConns(5)

	if err := database.Ping(); err != nil {
		return nil, err
	}

	logger.Log.Info().Msg("Connected to PostgreSQL")
	return database, nil
}

// Migrate reads and executes the SQL migration file.
func Migrate(database *sql.DB, migrationsDir string) error {
	migrationPath := filepath.Join(migrationsDir, "001_init.sql")
	content, err := os.ReadFile(migrationPath)
	if err != nil {
		// Try fallback locations: /migrations, ./migrations, ../migrations
		fallbacks := []string{"/migrations/001_init.sql", "./migrations/001_init.sql", "../migrations/001_init.sql"}
		for _, fb := range fallbacks {
			if data, fbErr := os.ReadFile(fb); fbErr == nil {
				content = data
				err = nil
				break
			}
		}
		if err != nil {
			return err
		}
	}

	if _, err := database.Exec(string(content)); err != nil {
		return err
	}

	logger.Log.Info().Msg("Database migrations applied successfully")
	return nil
}
