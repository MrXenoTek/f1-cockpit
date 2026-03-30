from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import fastf1
import datetime
import os # Ajout de l'import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# Correction : Créer le dossier s'il n'existe pas
os.makedirs('fastf1_cache', exist_ok=True)
fastf1.Cache.enable_cache('fastf1_cache') 

# ... reste du code intact ...