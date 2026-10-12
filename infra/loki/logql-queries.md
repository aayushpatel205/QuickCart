# QuickCart log queries

Run these in Grafana Explore with the Loki data source:

```logql
{namespace="quickcart"} | json | level="error"
{namespace="quickcart"} | json | orderId="ORD-001"
{namespace="quickcart", app="delivery-service"} | json
```
