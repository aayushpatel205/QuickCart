package db

import (
	"database/sql"

	"github.com/quickcart/delivery-service/internal/logger"
)

// Seed inserts 5 sample drivers if the drivers table is empty.
func Seed(database *sql.DB) error {
	var count int
	if err := database.QueryRow("SELECT COUNT(*) FROM drivers").Scan(&count); err != nil {
		return err
	}

	if count > 0 {
		logger.Log.Info().Int("existing", count).Msg("Drivers already seeded, skipping")
		return nil
	}

	query := `
		INSERT INTO drivers (name, phone, available) VALUES
			('Rahul Sharma',  '+91-9876543210', true),
			('Priya Patel',   '+91-9876543211', true),
			('Amit Kumar',    '+91-9876543212', true),
			('Sneha Gupta',   '+91-9876543213', true),
			('Vikram Singh',  '+91-9876543214', true)
	`

	if _, err := database.Exec(query); err != nil {
		return err
	}

	logger.Log.Info().Msg("Database seeded with 5 drivers")
	return nil
}
