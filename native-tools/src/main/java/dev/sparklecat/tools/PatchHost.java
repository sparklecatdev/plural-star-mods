package dev.sparklecat.tools;

import java.io.File;
import java.util.*;
import org.jf.dexlib2.*;
import org.jf.dexlib2.iface.*;
import org.jf.dexlib2.immutable.*;
import org.jf.dexlib2.immutable.instruction.*;
import org.jf.dexlib2.immutable.reference.ImmutableMethodReference;

/** Build-time only: preserve the pinned app's host and add its file-bundle override. */
public final class PatchHost {
    public static void main(String[] args) throws Exception {
        DexFile original = DexFileFactory.loadDexFile(new File(args[0]), Opcodes.forApi(26));
        DexFile loader = DexFileFactory.loadDexFile(new File(args[1]), Opcodes.forApi(26));
        List<ClassDef> classes = new ArrayList<>();
        String host = "Lcom/pluralspace/app/MainApplication$reactNativeHost$1;";
        boolean found = false;
        boolean packagesFound = false;
        for (ClassDef c : original.getClasses()) {
            if (!c.getType().equals(host)) { classes.add(c); continue; }
            List<Method> methods = new ArrayList<>();
            for (Method m : c.getMethods()) {
                if (m.getName().equals("getJSBundleFile")) throw new IllegalStateException("Unexpected existing bundle override");
                if (m.getName().equals("getPackages") && m.getParameterTypes().isEmpty()) {
                    methods.add(new ImmutableMethod(host, "getBasePackages", m.getParameters(), m.getReturnType(),
                        m.getAccessFlags(), m.getAnnotations(), m.getHiddenApiRestrictions(), m.getImplementation()));
                    packagesFound = true;
                } else methods.add(m);
            }
            methods.add(new ImmutableMethod(host, "getPackages", List.of(), "Ljava/util/List;",
                AccessFlags.PUBLIC.getValue(), Set.of(), Set.of(), new ImmutableMethodImplementation(2, List.of(
                    new ImmutableInstruction35c(Opcode.INVOKE_VIRTUAL, 1, 1, 0, 0, 0, 0,
                        new ImmutableMethodReference(host, "getBasePackages", List.of(), "Ljava/util/List;")),
                    new ImmutableInstruction11x(Opcode.MOVE_RESULT_OBJECT, 0),
                    new ImmutableInstruction35c(Opcode.INVOKE_STATIC, 1, 0, 0, 0, 0, 0,
                        new ImmutableMethodReference("Ldev/sparklecat/unlock/DeviceUnlockPackage;", "appendPackages",
                            List.of("Ljava/util/List;"), "Ljava/util/List;")),
                    new ImmutableInstruction11x(Opcode.MOVE_RESULT_OBJECT, 0),
                    new ImmutableInstruction11x(Opcode.RETURN_OBJECT, 0)), List.of(), List.of())));
            methods.add(new ImmutableMethod(host, "getJSBundleFile", List.of(), "Ljava/lang/String;",
                AccessFlags.PUBLIC.getValue(), Set.of(), Set.of(), new ImmutableMethodImplementation(2, List.of(
                    new ImmutableInstruction35c(Opcode.INVOKE_VIRTUAL, 1, 1, 0, 0, 0, 0,
                        new ImmutableMethodReference("Lcom/facebook/react/ReactNativeHost;", "getApplication", List.of(), "Landroid/app/Application;")),
                    new ImmutableInstruction11x(Opcode.MOVE_RESULT_OBJECT, 0),
                    new ImmutableInstruction35c(Opcode.INVOKE_STATIC, 1, 0, 0, 0, 0, 0,
                        new ImmutableMethodReference("Ldev/sparklecat/updates/BundleLoader;", "getBundleFile", List.of("Landroid/content/Context;"), "Ljava/lang/String;")),
                    new ImmutableInstruction11x(Opcode.MOVE_RESULT_OBJECT, 0),
                    new ImmutableInstruction11x(Opcode.RETURN_OBJECT, 0)), List.of(), List.of())));
            classes.add(new ImmutableClassDef(c.getType(), c.getAccessFlags(), c.getSuperclass(), c.getInterfaces(),
                c.getSourceFile(), c.getAnnotations(), c.getFields(), methods));
            found = true;
        }
        if (!found) throw new IllegalStateException("Pinned React Native host was not found");
        if (!packagesFound) throw new IllegalStateException("Pinned React Native package list was not found");
        classes.addAll(loader.getClasses());
        DexFileFactory.writeDexFile(args[2], new ImmutableDexFile(original.getOpcodes(), classes));
    }
}
