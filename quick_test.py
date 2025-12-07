import boto3
from datetime import datetime
import json

# DynamoDB設定
dynamodb = boto3.resource('dynamodb', region_name='ap-northeast-1')
table = dynamodb.Table('waste_disposal_history')

USER_ID = 'webapp_user'

# 新しいタイムスタンプで失敗データを追加
timestamp = datetime.now().isoformat()

item = {
    'user_id': USER_ID,
    'timestamp': timestamp,
    'image_path': 'test_session',
    'detected_items': ['ペットボトル'],
    'is_valid': False,
    'has_change': True,
    'rejection_reason': 'has_cap',
    'message': 'アカン、キャップついてるやんけ！',
    'raw_json': json.dumps({
        'detected_items': ['ペットボトル'],
        'is_valid': False,
        'rejection_reason': 'has_cap',
        'has_change': True,
        'message': 'アカン、キャップついてるやんけ！'
    })
}

table.put_item(Item=item)
print("Success: Added failure data")
print(f"  Timestamp: {timestamp}")
print(f"  is_valid: False")
print(f"  message: アカン、キャップついてるやんけ！")
print("\nARアプリで確認してください（Angryモデルが表示されるはずです）")
