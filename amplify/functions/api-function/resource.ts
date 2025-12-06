import { defineFunction } from '@aws-amplify/backend';

export const apiFunction = defineFunction({
    name: 'api-function',
    entry: './handler.ts',
    environment: {
        WASTE_DISPOSAL_TABLE_NAME: 'waste_disposal_history',
    },
});
