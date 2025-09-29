import requests
import sys
from datetime import datetime, date, timedelta
import json

class ComprehensiveTennisCourtAPITester:
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
        print(f"   URL: {url}")
        print(f"   Method: {method}")
        if data:
            print(f"   Data: {json.dumps(data, indent=2)}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=default_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=default_headers)

            print(f"   Response Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2, default=str)}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error Response: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Error Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "api/health", 200)

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/admin/login",
            200,
            data={"email": "admin@tenniscourt.com", "password": "admin123"}
        )
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_get_availability(self):
        """Test getting availability for tomorrow"""
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        success, response = self.run_test(
            "Get Availability",
            "GET",
            f"api/availability/{tomorrow}",
            200
        )
        if success:
            if 'slots' in response and isinstance(response['slots'], list):
                print(f"   Found {len(response['slots'])} time slots")
                courts = set()
                for slot in response['slots']:
                    courts.add(slot.get('court_number'))
                print(f"   Courts available: {sorted(courts)}")
                return len(courts) == 3
        return False

    def test_create_booking(self):
        """Test creating a new booking"""
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        booking_data = {
            "customer_name": "John Tennis Player",
            "email": "john@example.com",
            "phone": "(555) 123-4567",
            "booking_date": tomorrow,
            "start_time": "10:00",
            "court_number": 1
        }
        
        success, response = self.run_test(
            "Create Booking",
            "POST",
            "api/bookings",
            201,
            data=booking_data
        )
        
        if success and 'id' in response:
            self.test_booking_id = response['id']
            print(f"   Booking created with ID: {self.test_booking_id}")
            return True
        return False

    def test_duplicate_booking_same_day(self):
        """Test creating duplicate booking for same customer on same day (should fail)"""
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        booking_data = {
            "customer_name": "John Tennis Player",
            "email": "john@example.com",
            "phone": "(555) 123-4567",
            "booking_date": tomorrow,
            "start_time": "11:00",
            "court_number": 2
        }
        
        return self.run_test(
            "Duplicate Booking Same Day (Should Fail)",
            "POST",
            "api/bookings",
            400,
            data=booking_data
        )

    def test_get_all_bookings_no_auth(self):
        """Test getting all bookings without admin token (should fail)"""
        return self.run_test(
            "Get All Bookings (No Auth - Should Fail)",
            "GET",
            "api/bookings",
            401,
            headers={}
        )

    def test_get_all_bookings_admin(self):
        """Test getting all bookings (admin only)"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        success, response = self.run_test(
            "Get All Bookings (Admin)",
            "GET",
            "api/bookings",
            200,
            headers={'Authorization': f'Bearer {self.admin_token}'}
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} bookings")
            return True
        return False

    def test_get_customer_bookings(self):
        """Test getting customer bookings by email"""
        success, response = self.run_test(
            "Get Customer Bookings",
            "GET",
            "api/my-bookings/john@example.com",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} bookings for customer")
            return True
        return False

    def test_get_customer_bookings_empty(self):
        """Test getting customer bookings for non-existent email"""
        success, response = self.run_test(
            "Get Customer Bookings (Empty)",
            "GET",
            "api/my-bookings/nonexistent@example.com",
            200
        )
        
        if success and isinstance(response, list) and len(response) == 0:
            print(f"   Correctly returned empty list for non-existent customer")
            return True
        return False

    def test_delete_booking_no_auth(self):
        """Test deleting a booking without admin token (should fail)"""
        if not self.test_booking_id:
            print("❌ No booking ID available")
            return False
            
        return self.run_test(
            "Delete Booking (No Auth - Should Fail)",
            "DELETE",
            f"api/bookings/{self.test_booking_id}",
            401,
            headers={}
        )

    def test_delete_booking_admin(self):
        """Test deleting a booking (admin only)"""
        if not self.admin_token or not self.test_booking_id:
            print("❌ No admin token or booking ID available")
            return False
            
        success, response = self.run_test(
            "Delete Booking (Admin)",
            "DELETE",
            f"api/bookings/{self.test_booking_id}",
            200,
            headers={'Authorization': f'Bearer {self.admin_token}'}
        )
        
        return success

def main():
    print("🎾 Comprehensive Tennis Court Booking API Test Suite")
    print("=" * 60)
    
    tester = ComprehensiveTennisCourtAPITester()
    
    # Test sequence
    test_functions = [
        tester.test_health_check,
        tester.test_admin_login,
        tester.test_get_availability,
        tester.test_create_booking,
        tester.test_duplicate_booking_same_day,
        tester.test_get_all_bookings_no_auth,
        tester.test_get_all_bookings_admin,
        tester.test_get_customer_bookings,
        tester.test_get_customer_bookings_empty,
        tester.test_delete_booking_no_auth,
        tester.test_delete_booking_admin,
    ]
    
    # Run all tests
    for test_func in test_functions:
        try:
            test_func()
        except Exception as e:
            print(f"❌ Test {test_func.__name__} failed with exception: {str(e)}")
    
    # Print results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All backend tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())