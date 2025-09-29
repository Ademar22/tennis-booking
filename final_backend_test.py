import requests
import sys
from datetime import datetime, date, timedelta
import json

class FinalBackendTester:
    def __init__(self, base_url="https://04c79770-203d-43cb-bc55-06dcfea16452.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_booking_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        
        if headers:
            default_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=default_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=default_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data.get('detail', 'Unknown error')}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

def main():
    print("🎾 Final Backend API Test")
    print("=" * 40)
    
    tester = FinalBackendTester()
    
    # 1. Test admin login
    print("\n1. Testing Admin Authentication...")
    success, response = tester.run_test(
        "Admin Login",
        "POST",
        "api/admin/login",
        200,
        data={"email": "admin@tenniscourt.com", "password": "admin123"}
    )
    
    if success and 'access_token' in response:
        tester.admin_token = response['access_token']
        print(f"   ✅ Admin token obtained")
    else:
        print("❌ Cannot proceed without admin token")
        return 1

    # 2. Test security fix - GET bookings without auth should fail
    print("\n2. Testing Security Fix...")
    tester.run_test(
        "Get Bookings (No Auth)",
        "GET",
        "api/bookings",
        401,  # Should fail without auth
        headers={}
    )

    # 3. Test security fix - GET bookings with auth should work
    tester.run_test(
        "Get Bookings (With Auth)",
        "GET",
        "api/bookings",
        200,
        headers={'Authorization': f'Bearer {tester.admin_token}'}
    )

    # 4. Test booking creation with 201 status code
    print("\n3. Testing Booking Creation...")
    tomorrow = (date.today() + timedelta(days=2)).isoformat()  # Use day after tomorrow to avoid conflicts
    booking_data = {
        "customer_name": "John Tennis Player",
        "email": "john@example.com",
        "phone": "(555) 123-4567",
        "booking_date": tomorrow,
        "start_time": "14:00",  # Use 2 PM slot which should be available
        "court_number": 1
    }
    
    success, response = tester.run_test(
        "Create Booking (Returns 201)",
        "POST",
        "api/bookings",
        201,
        data=booking_data
    )
    
    if success and 'id' in response:
        tester.test_booking_id = response['id']
        print(f"   ✅ Booking created with ID: {tester.test_booking_id}")

    # 5. Test business rule - one booking per day
    print("\n4. Testing Business Rule (One Booking Per Day)...")
    duplicate_booking_data = {
        "customer_name": "John Tennis Player",
        "email": "john@example.com",  # Same email
        "phone": "(555) 123-4567",
        "booking_date": tomorrow,  # Same date
        "start_time": "15:00",  # Different time
        "court_number": 2  # Different court
    }
    
    tester.run_test(
        "Duplicate Booking Same Day (Should Fail)",
        "POST",
        "api/bookings",
        400,
        data=duplicate_booking_data
    )

    # 6. Test customer booking search
    print("\n5. Testing Customer Booking Search...")
    tester.run_test(
        "Get Customer Bookings",
        "GET",
        "api/my-bookings/john@example.com",
        200
    )

    # 7. Test admin delete booking
    print("\n6. Testing Admin Delete Booking...")
    if tester.test_booking_id:
        tester.run_test(
            "Delete Booking (Admin)",
            "DELETE",
            f"api/bookings/{tester.test_booking_id}",
            200,
            headers={'Authorization': f'Bearer {tester.admin_token}'}
        )

    # Print results
    print("\n" + "=" * 40)
    print(f"📊 Backend Test Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All backend tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())