# Plural Star Patcher - Feature Implementation Guide

## Overview
This guide provides detailed instructions for implementing new features in the sparklecat's plural star mods patcher, ensuring consistency with existing code patterns and best practices.

## Architecture Overview

The patcher consists of:
- **Patcher App** (`app/`): Android application that downloads, verifies, and modifies Plural Star APKs
- **Payload** (`payload/`): Modified source that gets embedded in patched APKs
- **Mods System**: JavaScript-based features implemented in `payload/mods/`
- **Native Components**: Java/Kotlin code in `native-tools/` for device-specific functionality

## Core Development Patterns

### 1. Mod Structure Convention
All new features should follow the existing mod pattern:
```
payload/mods/
├── featureNameCore.ts     # Core logic and state management  
├── featureNameUI.tsx      # React components for UI
├── featureNameSettings.ts # Settings configuration
└── featureNameConstants.ts# Constants and configuration
```

### 2. State Management
Use existing patterns from:
- `modPreferencesCore.ts` for preference persistence
- `toolsState.ts` for managing tool states
- Redux-like state management via React Context

### 3. Settings Integration  
All features must integrate with the mod menu system:
1. Add configuration to `ModMenu.tsx`
2. Implement toggle in `modPreferencesCore.ts`
3. Document feature behavior in README.md

## Implementation Process

### Step 1: Feature Design
1. Define feature scope and requirements
2. Review existing mod implementation patterns
3. Identify required dependencies and integration points  
4. Update README.md with new feature description

### Step 2: Code Development
1. Create core logic module (`featureNameCore.ts`)
2. Implement UI components (`featureNameUI.tsx`)
3. Add settings configuration
4. Integrate with existing preference system

### Step 3: Testing
1. Add relevant unit tests to `app/src/test/`
2. Validate against existing test suite
3. Test compatibility with different Plural Star versions
4. Run integration tests for patcher functionality

### Step 4: Documentation 
1. Update `fordevs.md` with implementation details
2. Add feature description to README.md  
3. Document any new configuration requirements

## Code Style Guidelines

### TypeScript/JavaScript
- Use strict typing throughout
- Follow existing naming conventions (`camelCase` for variables, `PascalCase` for components)
- Implement proper error handling with try/catch blocks
- Use async/await patterns consistently

### Android Java/Kotlin  
- Follow existing code structure in `app/src/main/java/`
- Implement proper lifecycle management
- Ensure all security considerations are addressed
- Use Android best practices for permissions and data handling

## Security Considerations

1. **Data Encryption**: All storage tools use scrypt with XSalsa20-Poly1305
2. **Key Management**: Device-specific keys generated through Android Keystore
3. **Input Validation**: All user inputs must be validated before processing
4. **Privacy Compliance**: No identifiers in diagnostics (except version numbers)
5. **Signature Verification**: APKs digitally signed and verified at every step

## Testing Requirements

### Unit Tests
All new features must include:
1. Core logic unit tests 
2. UI component tests
3. State management validation 
4. Integration with existing system components

### Integration Tests
- Full integration test for new functionality
- Compatibility testing across different Plural Star versions
- Performance impact measurement
- Backup/restore workflow testing

## Version Management

### Patch Release Process
1. Update version in `payload/release.json`
2. Commit changes with descriptive message  
3. Run automated tests on CI system
4. Publish patch release via GitHub Actions workflow
5. Update documentation and release notes

### Runtime Compatibility
- Support both `plural-star-1.23.3-mods-1` and `plural-star-1.23.3-mods-2` runtimes
- Maintain backward compatibility for settings
- Ensure smooth upgrade path between versions

## Best Practices

1. **Modularity**: Keep components reusable across different features
2. **Consistency**: Follow existing code patterns to maintain familiarity  
3. **Documentation**: Every feature added must be documented
4. **Testing**: Thorough testing before merging to main branch
5. **Security**: Security is prioritized over convenience in all implementations

## Release Workflow

1. Create feature branch from `main`
2. Implement feature following this guide
3. Update documentation (README.md, fordevs.md)
4. Run complete test suite  
5. Submit pull request for review
6. Merge to `main` after approval
7. Trigger patch release workflow

## Common Integration Points

### Settings System
Integrate with existing mod menu in `ModMenu.tsx`:
```typescript
// Example integration pattern
const [isEnabled, setIsEnabled] = useModPreference('featureName');

// In JSX 
<Switch 
  value={isEnabled} 
  onValueChange={setIsEnabled}
  title="Feature Name"
/>
```

### Storage Integration
Use existing snapshot infrastructure in `snapshotCore.ts`:
- Leverage existing encryption and validation functions  
- Follow same media handling patterns
- Ensure compliance with 32MiB payload limits

### PluralKit Sync
Build upon `pluralKitSyncCore.ts` patterns for API integration:
- Reuse configuration and error handling patterns 
- Follow same token storage and security practices

This guide ensures new features remain consistent with existing codebase architecture while maintaining quality, security, and usability standards.