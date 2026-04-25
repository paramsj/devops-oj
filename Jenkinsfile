pipeline {
    agent any

    tools {
        nodejs "node20" 
    }

    environment {
        MY_IP   = credentials('ec2-public-ip')
        EC2_KEY = credentials('aws-ec2-key')
        S_URL   = credentials('supabase-url')
        S_KEY   = credentials('supabase-key')
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main', url: 'https://github.com/paramsj/devops-oj.git'
            }
        }

        stage('Install and Test') {
            steps {
                // Using install instead of ci to be safer for first-time builds
                sh 'npm install'
                sh 'npm test'
            }
        }

        stage('Generate Configs') {
            steps {
                sh """
                set -eu

                cat > .env <<EOF
SUPABASE_URL=${S_URL}
SUPABASE_SERVICE_ROLE_KEY=${S_KEY}
PORT=3000
VITE_API_BASE=http://${MY_IP}:3000
EOF

                cat > inventory.ini <<EOF
[aws_ec2]
${MY_IP} ansible_user=ubuntu ansible_ssh_private_key_file=${EC2_KEY} ansible_python_interpreter=/usr/bin/python3
EOF

                chmod 600 "${EC2_KEY}"
                """
            }
        }

        stage('Deploy') {
            steps {
                // Ensure ansible-playbook is in the PATH or mapped correctly
                sh "ansible-playbook -i inventory.ini deploy.yml"
            }
        }
    }
}