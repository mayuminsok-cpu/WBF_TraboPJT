import boto3
from datetime import datetime
import json

# DynamoDB設定
dynamodb = boto3.resource('dynamodb', region_name='ap-northeast-1')
table = dynamodb.Table('waste_disposal_history')

USER_ID = 'webapp_user'

def add_test_record(is_valid, rejection_reason=None, message=None):
    """テストレコードを追加"""
    timestamp = datetime.now().isoformat()
    
    item = {
        'user_id': USER_ID,
        'timestamp': timestamp,
        'image_path': 'test_session',
        'detected_items': ['ペットボトル'],
        'is_valid': is_valid,
        'has_change': True,
        'message': message or ('よっしゃ！完璧や！' if is_valid else 'アカン、キャップついてるやんけ！'),
        'raw_json': json.dumps({
            'detected_items': ['ペットボトル'],
            'is_valid': is_valid,
            'rejection_reason': rejection_reason,
            'has_change': True,
            'message': message or ('よっしゃ！完璧や！' if is_valid else 'アカン、キャップついてるやんけ！')
        })
    }
    
    if rejection_reason:
        item['rejection_reason'] = rejection_reason
    
    table.put_item(Item=item)
    print(f"✓ Added record: is_valid={is_valid}, timestamp={timestamp}")
    return timestamp

def test_scenario_1():
    """シナリオ1: 失敗 → 成功 → 成功（モデルチェンジ発生）"""
    print("\n=== シナリオ1: 連続成功テスト ===")
    print("1. 失敗レコード追加...")
    add_test_record(False, 'has_cap', 'アカン、キャップついてるやんけ！')
    
    input("ARアプリで確認してください（Angryモデル表示）。Enter で次へ...")
    
    print("2. 成功レコード追加（1回目）...")
    add_test_record(True, message='よっしゃ！完璧や！')
    
    input("ARアプリで確認してください（Happyモデル表示）。Enter で次へ...")
    
    print("3. 成功レコード追加（2回目）...")
    add_test_record(True, message='よっしゃ！完璧や！')
    
    input("ARアプリで確認してください（Recycle Buddy登場！）。Enter で次へ...")

def test_scenario_2():
    """シナリオ2: 成功 → 失敗（連続成功なし）"""
    print("\n=== シナリオ2: 連続成功なしテスト ===")
    print("1. 成功レコード追加...")
    add_test_record(True, message='よっしゃ！完璧や！')
    
    input("ARアプリで確認してください（Happyモデル表示）。Enter で次へ...")
    
    print("2. 失敗レコード追加...")
    add_test_record(False, 'has_label', 'アカン、ラベルついてるやんけ！')
    
    input("ARアプリで確認してください（Angryモデル表示、モデルチェンジなし）。Enter で完了...")

def main():
    print("DynamoDB テストデータ挿入スクリプト")
    print("=" * 50)
    print(f"Table: waste_disposal_history")
    print(f"User ID: {USER_ID}")
    print(f"Region: ap-northeast-1")
    print("=" * 50)
    
    print("\nテストシナリオを選択してください:")
    print("1. 連続成功テスト（失敗 → 成功 → 成功）")
    print("2. 連続成功なしテスト（成功 → 失敗）")
    print("3. カスタム（手動で1件ずつ追加）")
    
    choice = input("\n選択 (1-3): ")
    
    if choice == '1':
        test_scenario_1()
    elif choice == '2':
        test_scenario_2()
    elif choice == '3':
        while True:
            print("\n--- カスタムレコード追加 ---")
            is_valid_input = input("is_valid (true/false): ").lower()
            is_valid = is_valid_input == 'true'
            
            message = input("メッセージ (空欄でデフォルト): ")
            if not message:
                message = None
            
            rejection_reason = None
            if not is_valid:
                print("rejection_reason: 1=has_cap, 2=has_label, 3=wrong_item, 4=dirty")
                reason_choice = input("選択 (1-4): ")
                reasons = {'1': 'has_cap', '2': 'has_label', '3': 'wrong_item', '4': 'dirty'}
                rejection_reason = reasons.get(reason_choice, 'has_cap')
            
            add_test_record(is_valid, rejection_reason, message)
            
            cont = input("\n続けますか？ (y/n): ")
            if cont.lower() != 'y':
                break
    
    print("\n✓ テスト完了！")

if __name__ == '__main__':
    main()
