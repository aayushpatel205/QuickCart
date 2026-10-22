package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/quickcart/delivery-service/internal/config"
	"github.com/quickcart/delivery-service/internal/db"
	"github.com/quickcart/delivery-service/internal/handler"
	kafkaconsumer "github.com/quickcart/delivery-service/internal/kafka"
	"github.com/quickcart/delivery-service/internal/logger"
	"github.com/quickcart/delivery-service/internal/middleware"
	"github.com/quickcart/delivery-service/internal/rabbitmq"
)

func main() {
	// ── Load configuration ──────────────────────────────────────────────
	cfg := config.Load()
	logger.Init(cfg.ServiceName, cfg.LogFilePath)
	logger.Log.Info().Str("port", cfg.Port).Msg("Starting delivery-service")

	// ── Context for graceful shutdown ───────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Database ────────────────────────────────────────────────────────
	database, err := db.Connect(cfg.DSN())
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("Failed to connect to PostgreSQL")
	}
	defer database.Close()

	if err := db.Migrate(database, "migrations"); err != nil {
		logger.Log.Fatal().Err(err).Msg("Failed to apply migrations")
	}
	if err := db.Seed(database); err != nil {
		logger.Log.Fatal().Err(err).Msg("Failed to seed database")
	}

	// ── RabbitMQ (non-fatal — service works without it) ─────────────────
	var publisher *rabbitmq.Publisher
	pub, err := rabbitmq.NewPublisher(cfg.RabbitMQURL)
	if err != nil {
		logger.Log.Warn().Err(err).Msg("RabbitMQ unavailable — notifications will be logged only")
	} else {
		publisher = pub
		defer publisher.Close()
	}

	// ── Kafka consumer (background goroutine) ──────────────────────────
	consumer := kafkaconsumer.NewConsumer(cfg.KafkaBrokers, database, publisher)
	defer consumer.Close()
	go consumer.Start(ctx)

	// ── Gin router ─────────────────────────────────────────────────────
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(middleware.CorrelationID())
	r.Use(middleware.RequestLogging())
	r.Use(gin.Recovery())

	// Handlers
	healthH := handler.NewHealthHandler(database)
	deliveryH := handler.NewDeliveryHandler(database, publisher)
	driverH := handler.NewDriverHandler(database)

	// Routes
	r.GET("/health", healthH.Health)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))
	r.GET("/deliveries/:orderId", deliveryH.GetDelivery)
	r.PUT("/deliveries/:orderId/status", deliveryH.UpdateStatus)
	r.GET("/drivers", driverH.ListDrivers)

	// ── HTTP server ────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Log.Info().Str("addr", srv.Addr).Msg("HTTP server listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Log.Fatal().Err(err).Msg("HTTP server failed")
		}
	}()

	// ── Graceful shutdown ──────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit

	logger.Log.Info().Str("signal", sig.String()).Msg("Shutdown signal received")
	cancel() // Stop Kafka consumer

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	logger.Log.Info().Msg("Delivery-service stopped cleanly")
}
