import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';
import { Mascot } from './Mascot';
import { FontSize, Radius } from '../constants/theme';
import { Button } from './ui';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// 렌더링 중 발생한 예외를 잡아 흰 화면(크래시) 대신 복구 가능한 화면을 보여준다.
// 리액트 에러 바운더리는 클래스 컴포넌트로만 구현 가능하다(훅으로 대체 불가).
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <View style={styles.mascot}>
            <Mascot mood="sorry" size={88} />
          </View>
          <Text style={styles.title}>문제가 발생했어요</Text>
          <Text style={styles.description}>
            화면을 표시하는 중 오류가 났어요. 다시 시도해도 반복되면 앱을 재시작해주세요.
          </Text>
          <Button label="다시 시도" onPress={this.handleReset} style={styles.button} />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: Colors.bgDefault,
  },
  mascot: {
    marginBottom: 12,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Colors.slate800,
    marginBottom: 8,
  },
  description: {
    fontSize: FontSize.label,
    color: Colors.slate500,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
  },
});
