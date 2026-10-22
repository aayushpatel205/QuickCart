FROM harshkumar1601/payment-service:latest
# Patch: replace ALL possible localhost DB references with paymentdb
RUN find /app -name "*.py" -exec sed -i \
    -e 's|@localhost:5432|@paymentdb:5432|g' \
    -e 's|@localhost/|@paymentdb/|g' \
    -e 's|host=.localhost.|host=paymentdb|g' \
    -e 's|"localhost", 5432|"paymentdb", 5432|g' \
    -e 's|host="localhost"|host="paymentdb"|g' \
    -e 's|localhost:5432|paymentdb:5432|g' \
    {} \; && \
    find /app -name "*.env" -exec sed -i 's|localhost|paymentdb|g' {} \; && \
    find /app -name "*.cfg" -exec sed -i 's|localhost|paymentdb|g' {} \; && \
    find /app -name "*.ini" -exec sed -i 's|localhost|paymentdb|g' {} \;
