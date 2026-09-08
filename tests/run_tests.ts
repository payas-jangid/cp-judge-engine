import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

async function runTests() {
    console.log('--- CP Judge Engine Test Suite ---');

    try {
        // 1. Create a dummy user (assuming we added a quick route or directly via prisma in a real test)
        // For now, we'll assume problem and test cases can be created without strict auth validation if we mocked it,
        // but our routes don't strictly validate authorId existence if foreign key checks are off, 
        // wait, Prisma does enforce foreign keys. We'll need a user.
        console.log('Note: To run these tests, ensure the DB is seeded with a User and a Problem.');
        console.log('Since this is an automated suite, you should run a seed script first.\n');

        // Let's demonstrate the payloads for the critical cases.
        const problemId = 1; // Assuming problem 1 is a simple A+B problem
        const userId = 1;

        const submissions = [
            {
                name: '1. AC (Accepted)',
                language: 'cpp',
                sourceCode: `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) cout << a + b << endl;
    return 0;
}
                `
            },
            {
                name: '2. WA (Wrong Answer)',
                language: 'cpp',
                sourceCode: `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) cout << a + b + 1 << endl; // Incorrect logic
    return 0;
}
                `
            },
            {
                name: '3. TLE (Time Limit Exceeded - Infinite Loop)',
                language: 'cpp',
                sourceCode: `
#include <iostream>
using namespace std;
int main() {
    while(true) {} // Infinite loop
    return 0;
}
                `
            },
            {
                name: '4. CE (Compile Error)',
                language: 'cpp',
                sourceCode: `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b // Missing semicolon
    return 0;
}
                `
            },
            {
                name: '5. MLE (Memory Limit Exceeded)',
                language: 'cpp',
                sourceCode: `
#include <iostream>
#include <vector>
using namespace std;
int main() {
    // Attempt to allocate a massive amount of memory
    vector<int*> ptrs;
    while(true) {
        ptrs.push_back(new int[1000000]);
    }
    return 0;
}
                `
            },
            {
                name: '6. Security Resilience: Fork Bomb',
                language: 'cpp',
                sourceCode: `
#include <unistd.h>
int main() {
    while(1) {
        fork();
    }
    return 0;
}
                `
            }
        ];

        for (const sub of submissions) {
            console.log(`Submitting: ${sub.name}`);
            try {
                const res = await axios.post(`${API_URL}/submissions`, {
                    problemId,
                    userId,
                    language: sub.language,
                    sourceCode: sub.sourceCode
                });
                console.log(`Submission created with ID: ${res.data.id}. Status: ${res.data.status}`);
                console.log('Listen via WebSockets or poll the GET /submissions/:id endpoint to see the final verdict.');
                console.log('--------------------------------------------------');
            } catch (err: any) {
                console.error(`Failed to submit ${sub.name}:`, err.message);
            }
        }

    } catch (err) {
        console.error('Test suite failed:', err);
    }
}

runTests();
