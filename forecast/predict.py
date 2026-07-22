import json
import os
import sys
from datetime import timedelta

import psycopg2
from sklearn.linear_model import LinearRegression


def connect_to_database():
    database_settings = {"dbname": os.getenv("DB_NAME", "crypto_analytics")}

    for env_name, setting_name in [
        ("DB_USER", "user"),
        ("DB_PASSWORD", "password"),
        ("DB_HOST", "host"),
        ("DB_PORT", "port"),
    ]:
        value = os.getenv(env_name)
        if value:
            database_settings[setting_name] = value

    return psycopg2.connect(**database_settings)


def main():
    coin_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1

    connection = connect_to_database()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT price_date, price_usd
        FROM price_history
        WHERE coin_id = %s
        ORDER BY price_date
        """,
        (coin_id,),
    )

    rows = cursor.fetchall()
    cursor.close()
    connection.close()

    if len(rows) < 2:
        print(json.dumps({"historical": [], "predictions": []}))
        return

    first_date = rows[0][0]
    x_values = []
    y_values = []
    historical = []

    for price_date, price in rows:
        day_number = (price_date - first_date).days
        x_values.append([day_number])
        y_values.append(float(price))
        historical.append({"date": str(price_date), "price": round(float(price), 2)})

    model = LinearRegression()
    model.fit(x_values, y_values)

    last_date = rows[-1][0]
    years = [1, 2, 3, 5]
    predictions = []

    for year in years:
        future_date = last_date + timedelta(days=365 * year)
        future_day_number = (future_date - first_date).days
        predicted_price = model.predict([[future_day_number]])[0]
        predictions.append(
            {
                "year": year,
                "date": str(future_date),
                "predicted_price": round(float(predicted_price), 2),
            }
        )

    print(json.dumps({"historical": historical, "predictions": predictions}))


if __name__ == "__main__":
    main()
