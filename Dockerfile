FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S quickcart && adduser -S quickcart -G quickcart
COPY --from=build /app/target/order-service-0.0.1-SNAPSHOT.jar app.jar
USER quickcart
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
