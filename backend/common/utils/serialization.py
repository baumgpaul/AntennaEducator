"""
Serialization utilities for complex and NumPy data types.
"""

from typing import Dict, Any, Union
import numpy as np
import json
from pathlib import Path


def serialize_complex(z: complex) -> Dict[str, float]:
    """
    Serialize a complex number to a dictionary.
    
    Args:
        z: Complex number
        
    Returns:
        Dictionary with 'real' and 'imag' keys
    """
    return {
        "real": float(z.real),
        "imag": float(z.imag)
    }


def deserialize_complex(data: Dict[str, float]) -> complex:
    """
    Deserialize a complex number from a dictionary.
    
    Args:
        data: Dictionary with 'real' and 'imag' keys
        
    Returns:
        Complex number
    """
    return complex(data["real"], data["imag"])


def serialize_numpy(arr: np.ndarray) -> Dict[str, Any]:
    """
    Serialize a NumPy array to a dictionary (for JSON).
    
    Args:
        arr: NumPy array
        
    Returns:
        Dictionary with array data and metadata
    """
    return {
        "data": arr.tolist(),
        "dtype": str(arr.dtype),
        "shape": arr.shape
    }


def deserialize_numpy(data: Dict[str, Any]) -> np.ndarray:
    """
    Deserialize a NumPy array from a dictionary.
    
    Args:
        data: Dictionary with 'data', 'dtype', and 'shape' keys
        
    Returns:
        NumPy array
    """
    arr = np.array(data["data"], dtype=data["dtype"])
    return arr.reshape(data["shape"])


def save_numpy_compressed(arr: np.ndarray, filepath: Union[str, Path]) -> None:
    """
    Save NumPy array to compressed .npz file.
    
    Args:
        arr: NumPy array
        filepath: Output file path
    """
    np.savez_compressed(filepath, data=arr)


def load_numpy_compressed(filepath: Union[str, Path]) -> np.ndarray:
    """
    Load NumPy array from compressed .npz file.
    
    Args:
        filepath: Input file path
        
    Returns:
        NumPy array
    """
    data = np.load(filepath)
    return data["data"]


class NumpyEncoder(json.JSONEncoder):
    """
    Custom JSON encoder for NumPy types.
    
    Usage:
        json.dumps(data, cls=NumpyEncoder)
    """
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, complex):
            return serialize_complex(obj)
        return super().default(obj)
