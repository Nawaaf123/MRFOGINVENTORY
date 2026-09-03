from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import auth, warehouses, categories, items, stock, transactions, orders, wholesalers, payments, audit, users

app = FastAPI(title="StockKeeper API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(warehouses.router)
app.include_router(categories.router)
app.include_router(items.router)
app.include_router(stock.router)
app.include_router(transactions.router)
app.include_router(orders.router)
app.include_router(wholesalers.router)
app.include_router(payments.router)
app.include_router(audit.router)
app.include_router(users.router)


@app.get("/")
async def root():
    return {"message": "StockKeeper API", "docs": "/docs"}
