"""Test runner script for comprehensive antenna simulator tests.

This script runs all test suites without pytest configuration issues.
"""

import sys
import importlib
import traceback


def run_test_module(module_name, test_functions):
    """Run tests from a module."""
    print(f"\n{'='*70}")
    print(f"Running: {module_name}")
    print('='*70)
    
    try:
        # Import module
        sys.path.insert(0, '.')
        module = importlib.import_module(module_name)
        
        passed = 0
        failed = 0
        
        for test_name in test_functions:
            try:
                # Get test function
                test_func = getattr(module, test_name)
                
                # Run test
                test_func()
                
                print(f"  ✓ {test_name}")
                passed += 1
                
            except Exception as e:
                print(f"  ✗ {test_name}")
                print(f"    Error: {str(e)}")
                failed += 1
        
        print(f"\n  Results: {passed} passed, {failed} failed")
        return passed, failed
        
    except Exception as e:
        print(f"  ✗ Failed to load module: {e}")
        traceback.print_exc()
        return 0, len(test_functions)


def main():
    """Run all test suites."""
    print("="*70)
    print(" ANTENNA SIMULATOR - COMPREHENSIVE TEST SUITE")
    print("="*70)
    
    total_passed = 0
    total_failed = 0
    
    # Test suites to run
    test_suites = [
        ("tests.test_port_parameters", [
            "test_port_parameters_simple_dipole",
            "test_reflection_coefficient_limits",
            "test_utility_functions"
        ]),
        ("tests.unit.test_field_computation.TestVectorPotential", [
            "test_vector_potential_units",
            "test_vector_potential_direction",
            "test_vector_potential_reciprocity"
        ]),
        ("tests.unit.test_field_computation.TestPoyntingVector", [
            "test_poynting_vector_shape",
            "test_poynting_vector_perpendicular",
            "test_poynting_spherical"
        ]),
        ("tests.unit.test_pattern_analysis.TestRadiationIntensity", [
            "test_radiation_intensity_units",
            "test_radiation_intensity_proportional_to_field_squared",
            "test_radiation_intensity_zero_field"
        ]),
        ("tests.unit.test_pattern_analysis.TestDirectivity", [
            "test_directivity_isotropic",
            "test_directivity_maximum_location",
            "test_directivity_greater_than_one"
        ]),
    ]
    
    for module_name, tests in test_suites:
        # Check if it's a class-based test
        if '.' in module_name.split('tests.')[-1] and module_name.count('.') >= 2:
            # Class-based tests
            parts = module_name.rsplit('.', 1)
            module_path = parts[0]
            class_name = parts[1]
            
            try:
                module = importlib.import_module(module_path)
                test_class = getattr(module, class_name)
                instance = test_class()
                
                print(f"\n{'='*70}")
                print(f"Running: {module_name}")
                print('='*70)
                
                passed = 0
                failed = 0
                
                for test_name in tests:
                    try:
                        test_method = getattr(instance, test_name)
                        test_method()
                        print(f"  ✓ {test_name}")
                        passed += 1
                    except Exception as e:
                        print(f"  ✗ {test_name}")
                        print(f"    Error: {str(e)}")
                        failed += 1
                
                print(f"\n  Results: {passed} passed, {failed} failed")
                total_passed += passed
                total_failed += failed
                
            except Exception as e:
                print(f"\n{'='*70}")
                print(f"Running: {module_name}")
                print('='*70)
                print(f"  ✗ Failed to load: {e}")
                total_failed += len(tests)
        else:
            # Module-level tests
            p, f = run_test_module(module_name, tests)
            total_passed += p
            total_failed += f
    
    # Final summary
    print("\n" + "="*70)
    print(" FINAL SUMMARY")
    print("="*70)
    print(f"  Total Passed:  {total_passed}")
    print(f"  Total Failed:  {total_failed}")
    print(f"  Success Rate:  {100*total_passed/(total_passed+total_failed):.1f}%")
    
    if total_failed == 0:
        print("\n  ✅ ALL TESTS PASSED!")
    else:
        print(f"\n  ⚠️  {total_failed} TEST(S) FAILED")
    
    print("="*70)
    
    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
