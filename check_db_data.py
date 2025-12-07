import boto3
import json

# DynamoDB設定
dynamodb = boto3.resource('dynamodb', region_name='ap-northeast-1')
table = dynamodb.Table('waste_disposal_history')

# 最新3件を取得
response = table.query(
    KeyConditionExpression='user_id = :uid',
    ExpressionAttributeValues={':uid': 'webapp_user'},
    ScanIndexForward=False,
    Limit=3
)

print("=== 最新3件のデータ ===")
for item in response['Items']:
    print(f"\nTimestamp: {item['timestamp']}")
    print(f"is_valid: {item.get('is_valid')}")
    print(f"has_change: {item.get('has_change')}")
    print(f"message: {item.get('message')}")
    print("-" * 50)

print(f"\n総件数: {response['Count']}")
