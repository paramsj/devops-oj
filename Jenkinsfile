pipeline {
    agent any

    environment {
        // Store EC2 public IP as Secret Text with this credential ID.
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
                sh 'npm ci'
                sh 'npm test'
            }
        }

        stage('Generate Configs') {
            steps {
                // Create deploy-time files in workspace root for deploy.yml copy task.
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
                sh "ansible-playbook -i inventory.ini deploy.yml"
            }
        }
    }
}