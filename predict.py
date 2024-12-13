import sys
from joblib import load
import numpy as np
import pandas as pd
import os 
import sklearn

# Define the feature names
FEATURE_NAMES = [
    'age', 'sex', 'trestbps', 'chol', 'fbs', 'thalach', 'exang', 'oldpeak', 
    'slope', 'ca', 'cp_1', 'cp_2', 'cp_3', 'restecg_1', 'restecg_2', 
    'thal_1', 'thal_2', 'thal_3'
]


# Load the model
model_path = "models/random_forest_model.pkl"

# if not os.path.exists(model_path):
#     print(f"Model file not found at {model_path}")
# else:
#     print(f"Model file found at {model_path}")

try:
    with open(model_path, "rb") as file:
        model = load(file)
    # model = load(model_path) # (Standard way) Automatically handles file opening and closing
    # print("Model loaded successfully.")
    # print(f"Loaded object type: {type(model)}")
    # Check if the model has the predict method
    # if not hasattr(model, 'predict'):
    #     raise ValueError("Loaded model does not have a 'predict' method.")
except Exception as e:
    # print(f"Error loading model=>: {e}")
    sys.exit(1)

# Parse input from Node.js
try:
    # check sys.argv for input data
    # print("Received arguments: ", sys.argv[1:]) # Log received arguments for debugging

    input_data = list(map(float, sys.argv[1:]))  # Accept comma-separated features # get the values from node js as sys.argv
    # input_array = np.array(input_data).reshape(1, -1)

    # Convert input array to DataFrame with feature names
    input_df = pd.DataFrame([input_data], columns=FEATURE_NAMES)
    # print(f"Input DataFrame:\n {input_df}")
except Exception as e:
    # print(f"Error parsing input data: {e}")
    sys.exit(1)


# Make prediction
try:
    prediction = model.predict(input_df)
    # Return prediction result
    print(prediction[0])  # Output 1 for disease, 0 for no disease
except Exception as e:
    # print(f"Error making prediction: {e}")
    sys.exit(1)
