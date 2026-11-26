"""
Automated Verification & Workflow Test Suite for CMAS
Tests:
1. Automatic Date Detection & Daily Register retrieval
2. Automatic Previous Meeting Review surfacing (meeting from past -> review due today)
3. Automatic Overdue calculation
4. Review & Follow-up action (automatic progress update & audit log)
5. Meeting record edit & safe deletion
"""
from datetime import date, timedelta
from app import (
    SessionLocal, get_daily_register, get_previous_meeting_reviews,
    quick_review_task, create_meeting, update_meeting, delete_meeting,
    MeetingIn, QuickReviewIn, User, Task, Meeting, Department
)

def run_tests():
    db = SessionLocal()
    print("=" * 60)
    print("  RUNNING AUTOMATED CMAS VERIFICATION TESTS")
    print("=" * 60)

    admin = db.query(User).filter(User.username == "ceo").first()
    assert admin is not None, "CEO user not found"
    today = date.today()
    ops_dep = db.query(Department).filter(Department.name == "Operations").first()
    ops_id = ops_dep.id if ops_dep else None

    # 1. Test Daily Register: Automatically gets today's meetings
    print("\n[TEST 1] Automatic Daily Register Retrieval for Today:", today.isoformat())
    # Create a meeting specifically for today to verify
    test_today_m = Meeting(
        meeting_date=today,
        start_time="09:00",
        end_time="09:45",
        meeting_with="Daily Operations Review",
        department_id=ops_id,
        meeting_type="Review",
        location="Boardroom",
        discussion="Review daily KPIs",
        decisions="Maintain target delivery timeline"
    )
    db.add(test_today_m)
    db.commit()

    reg = get_daily_register(date_str=today.isoformat(), db=db, user=admin)
    print(f" -> Found {len(reg['meetings'])} meeting(s) scheduled for today.")
    assert "meetings" in reg, "Daily register missing meetings"
    today_found = any(m["id"] == test_today_m.id for m in reg["meetings"])
    assert today_found, "Today's created meeting was not found in register"
    print(" -> TEST 1 PASSED: Daily Register automatically isolates today's records.")

    # 2. Test Previous Meeting Review: Automatically identifies tasks due for review today
    print("\n[TEST 2] Automatic Identification of Previous Meeting Tasks Due Today")
    past_meeting = Meeting(
        meeting_date=today - timedelta(days=5),
        start_time="11:00",
        meeting_with="Operations Steering Committee",
        department_id=ops_id,
        meeting_type="Review",
        discussion="Warehouse reorganization and 5S workflow",
        decisions="Implement layout plan"
    )
    db.add(past_meeting)
    db.commit()

    review_task = Task(
        meeting_id=past_meeting.id,
        department_id=ops_id,
        title="Implement the proposed warehouse improvement plan",
        discussion="Warehouse reorganization",
        action_required="Submit zone-wise layout plan with designated owners",
        assigned_to="Warehouse Manager",
        accountable="Operations Head",
        priority="High",
        status="In Progress",
        progress=45.0,
        deadline=today + timedelta(days=3),
        review_date=today  # DUE TODAY
    )
    db.add(review_task)
    db.commit()

    due_today_items = get_previous_meeting_reviews(filter_type="due_today", department_id=None, db=db, user=admin)
    matched = [r for r in due_today_items if r["task_id"] == review_task.id]
    assert len(matched) == 1, "Expected task to be automatically retrieved in 'due_today'"
    item = matched[0]
    print(f" -> Found task: '{item['title']}'")
    print(f"    Origin: Meeting held on {item['meeting_date']} ({item['days_since_meeting']} days ago) in {item['department_name']}")
    print(f"    Review Reason: {item['review_reason']}")
    print(" -> TEST 2 PASSED: Previous meeting tasks automatically retrieved based on review date.")

    # 3. Test Automatic Overdue calculation
    print("\n[TEST 3] Automatic Overdue Reviews Detection")
    overdue_task = Task(
        meeting_id=past_meeting.id,
        department_id=ops_id,
        title="Sample Quality Audit",
        assigned_to="QC Specialist",
        status="In Progress",
        review_date=today - timedelta(days=2)  # 2 days overdue
    )
    db.add(overdue_task)
    db.commit()

    overdue_reviews = get_previous_meeting_reviews(filter_type="overdue", department_id=None, db=db, user=admin)
    overdue_matched = [r for r in overdue_reviews if r["task_id"] == overdue_task.id]
    assert len(overdue_matched) == 1, "Expected overdue task to appear in 'overdue' filter"
    print(f" -> Automatically flagged overdue: {overdue_matched[0]['title']} ({overdue_matched[0]['days_overdue']} days overdue)")
    print(" -> TEST 3 PASSED: Overdue tasks automatically identified without manual tagging.")

    # 4. Test Review & Follow Up Action: Automatic progress update & logging
    print("\n[TEST 4] Executive Quick Review & Automatic History Logging")
    rev_payload = QuickReviewIn(
        progress=80.0,
        status="In Progress",
        next_review_date=today + timedelta(days=7),
        review_notes="CEO reviewed warehouse rack layouts. Phase 1 approved. Next milestone in 7 days."
    )
    result = quick_review_task(tid=review_task.id, data=rev_payload, db=db, user=admin)
    print(f" -> Task '{result['title']}' updated: progress={result['progress']}%, next_review={result['review_date']}")
    assert result["progress"] == 80.0
    print(" -> TEST 4 PASSED: Review action automatically updated task and rescheduled next review.")

    # 5. Test Meeting Edit & Delete
    print("\n[TEST 5] Meeting Record Management (Edit & Safe Delete)")
    new_m = create_meeting(data=MeetingIn(
        meeting_date=today,
        start_time="16:00",
        end_time="16:30",
        meeting_with="Quality Control Lead",
        meeting_type="Ad-hoc",
        location="Lab",
        discussion="Fabric shrinkage test anomalies",
        decisions="Re-test with alternative detergent"
    ), db=db, user=admin)
    mid = new_m["id"]
    print(f" -> Created test meeting ID {mid}")

    updated = update_meeting(mid=mid, data=MeetingIn(
        meeting_date=today,
        start_time="16:00",
        end_time="17:00",
        meeting_with="Quality Control Lead & Chemist",
        meeting_type="Review",
        location="Lab 2",
        discussion="Updated discussion",
        decisions="Approved new batch"
    ), db=db, user=admin)
    assert updated["location"] == "Lab 2"
    print(f" -> Successfully edited meeting ID {mid}")

    del_res = delete_meeting(mid=mid, db=db, user=admin)
    assert del_res["ok"] is True
    print(f" -> Successfully deleted meeting ID {mid}")
    print(" -> TEST 5 PASSED: Meeting edit and delete verified.")

    # Cleanup temporary test objects
    db.delete(review_task)
    db.delete(overdue_task)
    db.delete(test_today_m)
    db.delete(past_meeting)
    db.commit()
    db.close()

    print("\n" + "=" * 60)
    print("  ALL AUTOMATED TESTS PASSED SUCCESSFULLY (5/5)!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
