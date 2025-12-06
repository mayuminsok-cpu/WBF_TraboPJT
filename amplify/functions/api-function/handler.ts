import type { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = (globalThis as any).process?.env?.WASTE_DISPOSAL_TABLE_NAME || "waste_disposal_history";

export const handler: APIGatewayProxyHandler = async (event) => {
    console.log("event", event);
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
        return {
            statusCode: 400,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            },
            body: JSON.stringify({
                error: "userId is required",
            }),
        };
    }

    try {
        // DynamoDBから最新の履歴を取得
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "user_id = :userId",
            ExpressionAttributeValues: {
                ":userId": userId,
            },
            ScanIndexForward: false, // 降順ソート (最新が先)
            Limit: 1, // 最新の1件のみ
        });

        const response = await docClient.send(command);

        if (response.Items && response.Items.length > 0) {
            const latestRecord = response.Items[0];
            return {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                },
                body: JSON.stringify(latestRecord),
            };
        } else {
            // データが見つからない場合
            return {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                },
                body: JSON.stringify({
                    message: "No records found for this user",
                    userId: userId,
                }),
            };
        }
    } catch (error) {
        console.error("DynamoDB query error:", error);
        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            },
            body: JSON.stringify({
                error: "Failed to query database",
                message: error instanceof Error ? error.message : "Unknown error",
            }),
        };
    }
};
